/**
 * What a server may do, set by the admin. A missing entry means its default. Same table as
 * functions/src/users.ts RIGHT_DEFAULTS, the Firestore rules and android Rights.
 */
export const RIGHT_DEFAULTS = {
  logIn: true,
  noApproval: false,
  payments: true,
  reversePayments: true,
  closeTables: true,
  cancelOrders: true,
  moveTables: true,
} as const;
export type Right = keyof typeof RIGHT_DEFAULTS;
export type Rights = Partial<Record<Right, boolean>>;
export const RIGHTS = Object.keys(RIGHT_DEFAULTS) as Right[];

export const hasRight = (rights: Rights | undefined, right: Right) => rights?.[right] ?? RIGHT_DEFAULTS[right];
