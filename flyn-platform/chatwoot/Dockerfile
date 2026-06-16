FROM public.ecr.aws/l6m2t8p7/chatwoot/chatwoot:latest

ENV RAILS_ENV=production
ENV NODE_ENV=production
ENV DATABASE_URL=sqlite3:/app/db/production.sqlite3
ENV SECRET_KEY_BASE=${SECRET_KEY_BASE}
ENV FRONTEND_URL=https://inbox.myflynai.com
ENV ALLOW_IFRAME_EMBED=true
ENV RAILS_LOG_TO_STDOUT=true

# Run migrations and start server
RUN bundle exec rails db:chatwoot_prepare
EXPOSE 3000
CMD ["bundle", "exec", "rails", "s", "-p", "3000", "-b", "0.0.0.0"]
