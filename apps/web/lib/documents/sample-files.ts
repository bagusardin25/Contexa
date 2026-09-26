/**
 * Real sample documents for live sessions: the same "Notewave" project the preview
 * script is about, served from /public and uploaded through the API like any file.
 */
const SAMPLE_FILES = ["notewave-architecture.md", "notewave-readme.md"];

export async function fetchSampleFiles(): Promise<File[]> {
  return Promise.all(
    SAMPLE_FILES.map(async (name) => {
      const response = await fetch(`/samples/${name}`);
      if (!response.ok) throw new Error(`Couldn't load the sample ${name}.`);
      return new File([await response.blob()], name, { type: "text/markdown" });
    }),
  );
}
