import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { OrgMembersController } from './org-members.controller';
import { DatabaseService } from '../common/database.service';

@Module({
  controllers: [MembersController, OrgMembersController],
  providers: [DatabaseService, MembersService],
  exports: [MembersService],
})
export class MembersModule {}
