import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { StepsController } from './steps.controller';
import { StepsService } from './steps.service';

@Module({
  controllers: [StepsController],
  providers: [StepsService, DatabaseService],
  exports: [StepsService],
})
export class StepsModule {}
