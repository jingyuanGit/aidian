import { QueryBackedInstructionRefineService } from '../../../core/auxiliary/QueryBackedInstructionRefineService';
import type AidianPlugin from '../../../main';
import { CodexAuxQueryRunner } from '../runtime/CodexAuxQueryRunner';

export class CodexInstructionRefineService extends QueryBackedInstructionRefineService {
  constructor(plugin: AidianPlugin) {
    super(new CodexAuxQueryRunner(plugin));
  }
}
