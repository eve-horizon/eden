import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, DatabaseService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
