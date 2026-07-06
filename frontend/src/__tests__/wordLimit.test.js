import { describe, it, expect } from "vitest";
import { wordLimitFromInstructions, countAnswerWords } from "../component/QuestionInput";

describe("wordLimitFromInstructions", () => {
  it("parses ONE WORD ONLY", () => {
    expect(wordLimitFromInstructions(
      "Complete the notes below. Write ONE WORD ONLY from the passage for each answer."
    )).toEqual({ limit: 1, allowsNumber: false });
  });

  it("parses NO MORE THAN TWO WORDS", () => {
    expect(wordLimitFromInstructions(
      "Complete the summary below. Write NO MORE THAN TWO WORDS from the passage."
    )).toEqual({ limit: 2, allowsNumber: false });
  });

  it("parses the AND/OR A NUMBER variant", () => {
    expect(wordLimitFromInstructions(
      "Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer."
    )).toEqual({ limit: 3, allowsNumber: true });
  });

  it("returns null when no limit is stated", () => {
    expect(wordLimitFromInstructions("Choose TRUE, FALSE or NOT GIVEN.")).toBeNull();
    expect(wordLimitFromInstructions(null)).toBeNull();
  });
});

describe("countAnswerWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countAnswerWords("cotton factory")).toBe(2);
    expect(countAnswerWords("  father ")).toBe(1);
    expect(countAnswerWords("")).toBe(0);
  });

  it("treats hyphenated words as one", () => {
    expect(countAnswerWords("door-to-door")).toBe(1);
  });

  it("skips pure numbers when a number is allowed", () => {
    expect(countAnswerWords("30 percent", true)).toBe(1);
    expect(countAnswerWords("30 percent", false)).toBe(2);
    expect(countAnswerWords("1,500 workers", true)).toBe(1);
  });
});
