// pdf-parse's index.js triggers a debug-mode test PDF read on import. We
// import the inner module to skip that — but @types/pdf-parse only declares
// the package root. This shim re-exports the same default signature so the
// inner path is type-safe.
declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdf from 'pdf-parse';
  export default pdf;
}
