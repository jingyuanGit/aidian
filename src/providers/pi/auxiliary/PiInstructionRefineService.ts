import { QueryBackedInstructionRefineService } from '../../../core/auxiliary/QueryBackedInstructionRefineService';
import type AidianPlugin from '../../../main';
import { PiAuxQueryRunner } from '../runtime/PiAuxQueryRunner';

export class PiInstructionRefineService extends QueryBackedInstructionRefineService {
  constructor(plugin: AidianPlugin) {
    super(new PiAuxQueryRunner(plugin, { profile: 'passive' }));
  }
}
