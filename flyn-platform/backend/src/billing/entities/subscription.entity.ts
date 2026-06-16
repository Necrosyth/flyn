/**
 * Re-export SubscriptionRecord from the shared billing types.
 * Firestore documents for subscriptions are stored as SubscriptionRecord objects.
 * No ORM/TypeORM is used — Firestore is the storage layer.
 */
export { SubscriptionRecord } from '../billing.types';
