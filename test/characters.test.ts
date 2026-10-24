import { describe, expect, it } from "vitest";
import { findCharacter, hasFields, parseCharacters } from "../src/flow/characters.js";

const PROJECT = "2dd97d39-d7f7-4b7b-9268-afb3287bd46f";
// The project media payload's character list, as Flow returned it (October 2026).
const MARA = [
  PROJECT,
  "7187448a-f0a5-4562-b540-cd282dc35b18",
  null,
  [1, "Mara", [[["cb209402-1dac-4306-b19d-e7b2b1c5b870"]], [[null, "aoede"]], "Quiet, wry and observant."]],
  "a4fd27ea-6982-4d5f-828b-b1a24c3e02dc",
  [1376, 768],
  [1792825856, 304328000],
  [1792825993, 168835000],
];
// Just created from an image: no name, voice or notes yet.
const FRESH = [PROJECT, "11111111-1111-4111-8111-111111111111", null, [1, null, [[["22222222-2222-4222-8222-222222222222"]]]]];

const payload = (characters: unknown[]) => [null, [], [], [], null, characters, null, []];

describe("parseCharacters", () => {
  it("reads name, notes, voice and reference images", () => {
    expect(parseCharacters(payload([MARA]))).toEqual([
      {
        id: "7187448a-f0a5-4562-b540-cd282dc35b18",
        name: "Mara",
        info: "Quiet, wry and observant.",
        voice: "aoede",
        imageIds: ["cb209402-1dac-4306-b19d-e7b2b1c5b870"],
      },
    ]);
  });

  it("handles a character with nothing set yet", () => {
    expect(parseCharacters(payload([FRESH]))).toEqual([
      { id: "11111111-1111-4111-8111-111111111111", name: "Untitled character", imageIds: ["22222222-2222-4222-8222-222222222222"] },
    ]);
  });

  it("returns nothing for a project without characters", () => {
    expect(parseCharacters(payload([]))).toEqual([]);
    expect(parseCharacters([null, [], []])).toEqual([]);
  });
});

describe("findCharacter", () => {
  const characters = parseCharacters(payload([MARA, FRESH]));

  it("finds by id or by name, ignoring case", () => {
    expect(findCharacter(characters, "7187448a-f0a5-4562-b540-cd282dc35b18").name).toBe("Mara");
    expect(findCharacter(characters, " mara ").name).toBe("Mara");
  });

  it("names the project's characters when there is no match", () => {
    expect(() => findCharacter(characters, "Lana")).toThrow(/has: Mara, Untitled character/);
  });
});

describe("hasFields", () => {
  const [mara] = parseCharacters(payload([MARA]));

  it("matches what was set, ignoring voice case and unset fields", () => {
    expect(hasFields(mara, { name: "Mara", voice: "Aoede" })).toBe(true);
    expect(hasFields(mara, {})).toBe(true);
  });

  it("notices a field Flow has not saved yet", () => {
    expect(hasFields(mara, { voice: "Leda" })).toBe(false);
    expect(hasFields(mara, { info: "Something else" })).toBe(false);
  });
});
