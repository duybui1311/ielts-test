import { describe, it, expect } from "vitest";
import { matchingLabel } from "../component/QuestionInput";

describe("matchingLabel", () => {
  it("shows just the letter when the option text is the same letter", () => {
    // The reported "A — A" case: option bank stores bare letters.
    expect(matchingLabel(0, "A")).toBe("A");
    expect(matchingLabel(2, "C")).toBe("C");
  });

  it("shows just the letter when the option text is blank", () => {
    expect(matchingLabel(1, "")).toBe("B");
    expect(matchingLabel(1, undefined)).toBe("B");
  });

  it("shows 'letter — text' when the option is a real heading", () => {
    expect(matchingLabel(0, "The rise of remote work")).toBe("A — The rise of remote work");
  });
});
