import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { PublicBranchesController } from './public-branches.controller';

@Module({
  controllers: [BranchesController, PublicBranchesController],
  providers: [BranchesService],
})
export class BranchesModule {}
