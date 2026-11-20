import type { HtmlCurriculumComposerApi } from '../shared/ipc';

declare global {
  interface Window {
    hccApi: HtmlCurriculumComposerApi;
  }
}

export {};
