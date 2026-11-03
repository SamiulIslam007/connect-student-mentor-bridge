import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIELD_NAME_MAX_LENGTH,
  isAcceptableFieldName,
  normalizeFieldName,
} from "../src/index.js";

test("case and separators collide into one slug", () => {
  assert.equal(normalizeFieldName("Data science"), "data science");
  assert.equal(normalizeFieldName("data-science"), "data science");
  assert.equal(normalizeFieldName("DATA SCIENCE"), "data science");
  assert.equal(normalizeFieldName("Data_Science"), "data science");
});

test("runs of separators collapse to one space", () => {
  assert.equal(normalizeFieldName("  Data___Science  "), "data science");
  assert.equal(normalizeFieldName("data \t-\n science"), "data science");
});

test("Bangla input keeps its characters and stays non-empty", () => {
  const bangla = "ডাটা সায়েন্স";
  assert.equal(normalizeFieldName(bangla), bangla);
  assert.ok(normalizeFieldName(bangla).length > 0);
});

test("NFKC folds full-width compatibility forms", () => {
  assert.equal(normalizeFieldName("ＡＩ"), "ai");
  assert.equal(normalizeFieldName("ＡＩ"), normalizeFieldName("AI"));
});

test("format characters are stripped after NFKC", () => {
  assert.equal(normalizeFieldName("A\u200BI"), "ai");
  assert.equal(normalizeFieldName("A\u200BI"), normalizeFieldName("AI"));
  assert.equal(normalizeFieldName("\u200B"), "");
  assert.equal(isAcceptableFieldName("\u200B\u200B"), false, "a zero-width-only name is refused");
});

test("a name needs a letter or number", () => {
  assert.equal(isAcceptableFieldName("+++"), false);
  assert.equal(isAcceptableFieldName("😀😀"), false);
  assert.equal(isAcceptableFieldName("C++"), true, "punctuation with a letter stays valid");
  assert.equal(isAcceptableFieldName("1"), true);
});

test("punctuation stays significant", () => {
  assert.notEqual(normalizeFieldName("C++"), normalizeFieldName("C"));
  assert.equal(normalizeFieldName("C++"), "c++");
});

test("empty and separator-only input normalize to an empty slug", () => {
  assert.equal(normalizeFieldName(""), "");
  assert.equal(normalizeFieldName("   "), "");
  assert.equal(normalizeFieldName("___"), "");
});

test("the display-name bound is 1 to 100 trimmed characters", () => {
  assert.equal(FIELD_NAME_MAX_LENGTH, 100);
  assert.equal(isAcceptableFieldName("AI"), true);
  assert.equal(isAcceptableFieldName("a".repeat(100)), true);
  assert.equal(isAcceptableFieldName("a".repeat(101)), false);
  assert.equal(isAcceptableFieldName("   "), false);
});
