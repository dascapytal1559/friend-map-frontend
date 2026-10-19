// Errors the HTTP handlers turn into status codes: 404, 400 and 403.

export class NotFoundError extends Error {}
export { InvalidInputError } from "../src/invalidInput.ts";
/** The request came from another site (see fromOwnPage in jsonApi.ts). */
export class ForbiddenError extends Error {}
