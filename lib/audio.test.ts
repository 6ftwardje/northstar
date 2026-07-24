import { describe, expect, it } from "vitest";
import {
  baseMimeType,
  chooseRecorderMimeType,
  getAudioExtension,
  getAudioFilename,
} from "./audio";

describe("audio helpers", () => {
  it("prefers the iPhone-compatible MP4 recorder format", () => {
    expect(
      chooseRecorderMimeType((type) =>
        ["audio/mp4", "audio/webm"].includes(type),
      ),
    ).toBe("audio/mp4");
  });

  it("falls back to WebM with Opus when MP4 is unavailable", () => {
    expect(
      chooseRecorderMimeType((type) => type === "audio/webm;codecs=opus"),
    ).toBe("audio/webm;codecs=opus");
  });

  it("normalizes codec parameters before selecting an extension", () => {
    expect(baseMimeType("audio/mp4;codecs=mp4a.40.2")).toBe("audio/mp4");
    expect(getAudioFilename("audio/mp4;codecs=mp4a.40.2")).toBe(
      "northstar-entry.mp4",
    );
  });

  it("uses a supported filename when the browser omits the MIME type", () => {
    expect(getAudioExtension("", "recording.m4a")).toBe("m4a");
  });

  it("rejects unknown containers", () => {
    expect(getAudioFilename("application/octet-stream", "recording.bin")).toBe(
      null,
    );
  });
});
