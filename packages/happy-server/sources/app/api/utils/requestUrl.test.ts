import { describe, expect, it } from "vitest";
import { normalizeLeadingSlashes } from "./requestUrl";

describe("normalizeLeadingSlashes", () => {
    it("collapses duplicate leading slashes before API routing", () => {
        expect(normalizeLeadingSlashes("//v1/auth")).toBe("/v1/auth");
        expect(normalizeLeadingSlashes("///v1/auth")).toBe("/v1/auth");
    });

    it("leaves normal paths untouched", () => {
        expect(normalizeLeadingSlashes("/v1/auth")).toBe("/v1/auth");
        expect(normalizeLeadingSlashes("/")).toBe("/");
        expect(normalizeLeadingSlashes(undefined)).toBeUndefined();
    });
});
