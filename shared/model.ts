import { translate, type MessageId, type MessageParams } from './i18n.js';

/** Error with a translatable message ID. The message is the German text for logs and diagnostics. */
export class AppError extends Error {
  constructor(
    public status: number,
    public id: MessageId,
    public params?: MessageParams,
  ) {
    super(translate(id, 'de', params));
  }
}
export function assert(condition: unknown, id: MessageId, status = 400, params?: MessageParams): asserts condition {
  if (!condition) throw new AppError(status, id, params);
}
