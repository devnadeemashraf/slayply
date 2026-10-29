// The minified builds are what ships (smaller); they have the same API as the typed package root.
declare module "pdfjs-dist/build/pdf.min.mjs" {
  export * from "pdfjs-dist";
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const url: string;
  export default url;
}
