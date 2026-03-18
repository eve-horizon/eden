import { Module } from '@nestjs/common';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [MembersModule],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
