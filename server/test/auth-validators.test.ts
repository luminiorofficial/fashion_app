import test from "node:test";
import assert from "node:assert/strict";
import {ApiError} from "../src/utils/api-error";
import {phone, fullName, birthDate} from "../src/validators/auth.validators";

function rejects(fn: () => unknown) {
  assert.throws(fn, ApiError);
}

test("phone accepts a well-formed Indian mobile number for every valid first digit", () => {
  for (const first of ["6", "7", "8", "9"]) {
    assert.equal(phone(`+91${first}876543210`), `+91${first}876543210`);
  }
});

test("phone rejects an Indian number starting with 0-5, including all-zero placeholders", () => {
  rejects(() => phone("+910000000000"));
  rejects(() => phone("+915876543210"));
  rejects(() => phone("+911234567890"));
});

test("phone rejects an incomplete or overlong Indian number", () => {
  rejects(() => phone("+9198765"));
  rejects(() => phone("+919876543210999"));
});

test("phone rejects letters and special characters", () => {
  rejects(() => phone("+91987654321a"));
  rejects(() => phone("+91-987-654-32!"));
});

test("phone still accepts a non-Indian E.164 number (no digit-6-9 rule applied)", () => {
  assert.equal(phone("+14155552671"), "+14155552671");
});

test("fullName trims, collapses internal whitespace, and allows spaced names", () => {
  assert.equal(fullName("Riya Sharma"), "Riya Sharma");
  assert.equal(fullName("  Riya    Sharma  "), "Riya Sharma");
  assert.equal(fullName("Anne-Marie O'Brien"), "Anne-Marie O'Brien");
});

test("fullName rejects empty, numbers-only, and special-character-only input", () => {
  rejects(() => fullName(""));
  rejects(() => fullName("   "));
  rejects(() => fullName("12345"));
  rejects(() => fullName("!!!@@@"));
  rejects(() => fullName("----"));
});

test("fullName rejects a name containing digits", () => {
  rejects(() => fullName("Riya123"));
});

test("birthDate rejects a date with an out-of-range month like 2000-24-12", () => {
  rejects(() => birthDate("2000-24-12"));
});

test("birthDate rejects a calendar date that does not exist, like Feb 30", () => {
  rejects(() => birthDate("2000-02-30"));
});

test("birthDate rejects a future date", () => {
  const future = new Date();
  future.setFullYear(future.getFullYear() + 1);
  rejects(() => birthDate(future.toISOString().slice(0, 10)));
});

test("birthDate rejects a malformed string", () => {
  rejects(() => birthDate("05/05/1995"));
  rejects(() => birthDate("not-a-date"));
});

test("birthDate accepts a valid past date in ISO format", () => {
  assert.equal(birthDate("1995-05-05"), "1995-05-05");
});
