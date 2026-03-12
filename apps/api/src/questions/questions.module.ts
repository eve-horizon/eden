import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService, DatabaseService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
