import { applyDecorators, SetMetadata, UseInterceptors } from "@nestjs/common";

import { IdempotencyInterceptor } from "./interceptor.js";

/** The metadata key the interceptor reads for the operation name (design R5). */
export const IDEMPOTENT_METADATA = "connect:idempotent";

/**
 * Marks a write as safe to repeat. The operation is a server-chosen literal
 * (`message.create`, `outcome.report`, `request.create`), never a client value,
 * and the interceptor is applied here so the set of keyed routes stays readable
 * in the controller.
 */
export function Idempotent(operation: string) {
  return applyDecorators(
    SetMetadata(IDEMPOTENT_METADATA, operation),
    UseInterceptors(IdempotencyInterceptor),
  );
}
