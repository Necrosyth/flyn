#!/bin/sh
# Exit immediately if a command exits with a non-zero status.
set -e

# Source the environment variables to make them available to the script
if [ -f /app/chatwoot.env ]; then
  export $(cat /app/chatwoot.env | sed 's/#.*//g' | xargs)
fi

# Variables
DB_HOST="db"
DB_PORT="5432"

# Wait for the database to be ready
echo "Waiting for database at $DB_HOST:$DB_PORT..."

# Use netcat (nc) to check if the port is open. Loop until it is.
until nc -z -v -w30 $DB_HOST $DB_PORT
do
  echo "Database is not ready yet. Retrying in 5 seconds..."
  sleep 5
done

echo "Database is up - executing command"

# Check if the database has been initialized for Chatwoot
# We do this by checking if a key table like 'users' exists.
# This prevents the prepare command from running on every restart.
if ! PGPASSWORD=$POSTGRES_PASSWORD psql -h "$DB_HOST" -U "$POSTGRES_USERNAME" -d "$POSTGRES_DATABASE" -c '\dt users' | grep -q 'public | users'; then
  echo "Chatwoot database not initialized. Running db:chatwoot_prepare..."
  bundle exec rails db:chatwoot_prepare
else
  echo "Chatwoot database already initialized. Skipping prepare."
fi

# Start the main application
echo "Starting Chatwoot server..."
rm -f /app/tmp/pids/server.pid
exec bundle exec rails s -p 3000 -b 0.0.0.0
