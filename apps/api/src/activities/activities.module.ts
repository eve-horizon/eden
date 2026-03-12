import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService, DatabaseService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
