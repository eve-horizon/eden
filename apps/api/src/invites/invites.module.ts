import { Module } from '@nestjs/common';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { MembersModule } from '../members/members.module';
import { DatabaseService } from '../common/database.service';

@Module({
  imports: [MembersModule],
  controllers: [InvitesController],
  providers: [DatabaseService, InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
