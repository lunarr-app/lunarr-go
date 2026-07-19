import { describe, expect, test } from "bun:test";
import { convertSrtToVtt } from "./srt-to-vtt";

describe("convertSrtToVtt", () => {
  test("converts a basic SRT file", () => {
    const srt = `1
00:00:00,000 --> 00:00:02,000
Hello

2
00:00:02,000 --> 00:00:03,500
Line two
`;
    const vtt = convertSrtToVtt(srt);
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:02.000");
    expect(vtt).toContain("Hello");
    expect(vtt).toContain("00:00:02.000 --> 00:00:03.500");
    expect(vtt).toContain("Line two");
  });

  test("handles Windows line endings", () => {
    const srt = "1\r\n00:00:01,250 --> 00:00:03,750\r\nText\r\n";
    const vtt = convertSrtToVtt(srt);
    expect(vtt).toContain("00:00:01.250 --> 00:00:03.750");
    expect(vtt).toContain("Text");
  });

  test("strips a leading BOM", () => {
    const srt = "\uFEFF1\n00:00:01,000 --> 00:00:02,000\nText\n";
    const vtt = convertSrtToVtt(srt);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
  });

  test("escapes HTML-like characters", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nRock & Roll <3\n";
    const vtt = convertSrtToVtt(srt);
    expect(vtt).toContain("Rock &amp; Roll &lt;3");
  });

  test("preserves basic formatting tags", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\n<b>Bold</b> & <i>italic</i>\n";
    const vtt = convertSrtToVtt(srt);
    expect(vtt).toContain("<b>Bold</b>");
    expect(vtt).toContain("<i>italic</i>");
    expect(vtt).toContain("&amp;");
  });

  test("removes font formatting tags", () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\n<font color="red">Text</font>\n';
    const vtt = convertSrtToVtt(srt);
    expect(vtt).not.toContain("<font");
    expect(vtt).toContain("Text");
  });

  test("escapes unsupported markup tags", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\n<c.red>Text</c>\n";
    const vtt = convertSrtToVtt(srt);
    expect(vtt).toContain("&lt;c.red&gt;Text&lt;/c&gt;");
  });
});
