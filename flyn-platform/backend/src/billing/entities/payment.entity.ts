/**
 * Re-export PaymentRecord from the shared billing types.
 * Firestore documents for payments are stored as PaymentRecord objects.
 * No ORM/TypeORM is used — Firestore is the storage layer.
 */
export { PaymentRecord } from '../billing.types';
