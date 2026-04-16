/**
 * Configure Monaco editor to load from app (not CDN) and provide workers.
 * Must run before any Monaco code loads.
 */
import { loader } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker.js?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker.js?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker.js?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker.js?worker';

// Load Monaco from /vs (public copy) instead of CDN so CSP doesn't block
loader.config({
  paths: { vs: '/vs' },
});

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker: (_: unknown, label: string) => Worker;
    };
  }
}

(self as Window).MonacoEnvironment = {
  getWorker(_, label: string) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};
