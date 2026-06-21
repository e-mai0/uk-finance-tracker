// Account-related shared constants.
//
// This is a PLAIN module (NO "use server"): a "use server" file may only export
// async functions, so runtime constants like the deletion confirmation phrase
// must live outside the server-action module. Both the server action
// (src/server/actions/account.ts) and the client section
// (src/app/(app)/settings/account-data.tsx) import this single source of truth.

/** The exact phrase the user must type to confirm an irreversible deletion. */
export const DELETE_CONFIRM_PHRASE = "DELETE";
