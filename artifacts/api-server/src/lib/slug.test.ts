import { describe, it, expect, afterEach } from "vitest";
import {
  slugify,
  validateSlug,
  isReservedSlug,
  slugRejectionReason,
} from "./slug";

/** Pure slug rules for self-serve signup — no DB, runs anywhere. */
describe("signup slug rules", () => {
  afterEach(() => {
    delete process.env.PLATFORM_HOSTS;
  });

  it("slugifies a club name to a DNS-safe label", () => {
    expect(slugify("Halls Head Cricket Club")).toBe("halls-head-cricket-club");
    expect(slugify("South Mandurah CC!!")).toBe("south-mandurah-cc");
    expect(slugify("  Spaces  &  Symbols  ")).toBe("spaces-symbols");
  });

  it("accepts a well-formed slug", () => {
    expect(validateSlug("mandurah")).toBeNull();
    expect(validateSlug("south-mandurah")).toBeNull();
  });

  it("rejects malformed, too-short and too-long slugs", () => {
    expect(validateSlug("a")).toBe("too-short");
    expect(validateSlug("-leading")).toBe("malformed");
    expect(validateSlug("trailing-")).toBe("malformed");
    expect(validateSlug("has space")).toBe("malformed");
    expect(validateSlug("under_score")).toBe("malformed");
    expect(validateSlug("x".repeat(41))).toBe("too-long");
  });

  it("normalises case rather than rejecting it (slugs are lowercased)", () => {
    expect(validateSlug("Mandurah")).toBeNull();
  });

  it("rejects reserved words and platform apex labels", () => {
    expect(validateSlug("www")).toBe("reserved");
    expect(validateSlug("admin")).toBe("reserved");
    expect(validateSlug("api")).toBe("reserved");

    process.env.PLATFORM_HOSTS = "ovation.app,www.ovation.app";
    expect(isReservedSlug("ovation")).toBe(true);
    expect(isReservedSlug("mandurah")).toBe(false);
  });

  it("gives a human-readable reason for each rejection", () => {
    expect(slugRejectionReason("too-short")).toMatch(/minimum/i);
    expect(slugRejectionReason("reserved")).toMatch(/reserved/i);
    expect(slugRejectionReason("malformed")).toMatch(/lowercase/i);
  });
});
