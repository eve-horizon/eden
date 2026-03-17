import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { DatabaseService } from '../common/database.service';

@Module({
  controllers: [MembersController],
  providers: [DatabaseService, MembersService],
  exports: [MembersService],
})
export class MembersModule {}
