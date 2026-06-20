import { QueryBackedInlineEditService } from '../../../core/auxiliary/QueryBackedInlineEditService';
import type AidianPlugin from '../../../main';
import { OpencodeAuxQueryRunner } from '../runtime/OpencodeAuxQueryRunner';

export class OpencodeInlineEditService extends QueryBackedInlineEditService {
  constructor(plugin: AidianPlugin) {
    super(new OpencodeAuxQueryRunner(plugin, {
      agentProfile: 'readonly',
      artifactPurpose: 'inline',
      allowReadTextFile: true,
    }));
  }
}
