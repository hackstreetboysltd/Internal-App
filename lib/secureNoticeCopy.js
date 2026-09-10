export const SECURE_CHANNEL_ADDED = "You have been added to this secure channel. Check it out";
export const SECURE_MESSAGE_RECEIVED = "You have received a secure message. Check it out";

/**
 * @param {unknown} action
 * @returns {boolean}
 */
export function isSecureNoticeAction(action) {
  return action === SECURE_CHANNEL_ADDED || action === SECURE_MESSAGE_RECEIVED;
}
