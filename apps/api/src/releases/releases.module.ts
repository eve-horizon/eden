import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { ReleasesController } from './releases.controller';
import { ReleasesService } from './releases.service';

@Module({
  controllers: [ReleasesController],
  providers: [ReleasesService, DatabaseService],
  exports: [ReleasesService],
})
export class ReleasesModule {}
