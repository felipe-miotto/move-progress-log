import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseState } from "./oauthState.ts";

const SID = "a0000000-0000-4000-8000-000000000001";
const IID = "d0000000-0000-4000-8000-000000000001";

Deno.test("parseState accepts valid student:invite:origin", () => {
  const p = parseState(`${SID}:${IID}:b64origin`);
  assertEquals(p.student_id, SID);
  assertEquals(p.invite_id, IID);
  assertEquals(p.encodedOrigin, "b64origin");
});

Deno.test("parseState accepts missing origin", () => {
  assertEquals(parseState(`${SID}:${IID}`).encodedOrigin, null);
});

Deno.test("parseState rejects a non-UUID student_id", () => {
  assertThrows(() => parseState(`not-a-uuid:${IID}`));
});

Deno.test("parseState rejects the deprecated 'retry' marker", () => {
  assertThrows(() => parseState(`${SID}:retry`));
});
