import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [DatabaseService, TasksService],
  exports: [TasksService],
})
export class TasksModule {}
