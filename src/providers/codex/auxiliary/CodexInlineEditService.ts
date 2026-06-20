import { QueryBackedInlineEditService } from '../../../core/auxiliary/QueryBackedInlineEditService';
import type AidianPlugin from '../../../main';
import { CodexAuxQueryRunner } from '../runtime/CodexAuxQueryRunner';

export class CodexInlineEditService extends QueryBackedInlineEditService {
  constructor(plugin: AidianPlugin) {
    super(new CodexAuxQueryRunner(plugin));
  }
}
