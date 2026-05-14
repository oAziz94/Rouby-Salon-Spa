import { PartialType } from '@nestjs/swagger';
import { SlotGenerationOverridesDto } from '../../slots/dto/slot-generation-overrides.dto';

export class PatchBranchSlotSettingsDto extends PartialType(
  SlotGenerationOverridesDto,
) {}
