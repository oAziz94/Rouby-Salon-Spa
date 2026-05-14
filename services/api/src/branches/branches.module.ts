import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { PublicBranchesController } from './public-branches.controller';

@Module({
  imports: [AuditModule],
  controllers: [BranchesController, PublicBranchesController],
  providers: [BranchesService],
})
export class BranchesModule {}
