import { QueryBackedInlineEditService } from '../../../core/auxiliary/QueryBackedInlineEditService';
import type AidianPlugin from '../../../main';
import { PiAuxQueryRunner } from '../runtime/PiAuxQueryRunner';

export class PiInlineEditService extends QueryBackedInlineEditService {
  constructor(plugin: AidianPlugin) {
    super(new PiAuxQueryRunner(plugin, { profile: 'readonly' }));
  }
}
