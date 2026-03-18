import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { ViewsController } from './views.controller';
import { ViewsService } from './views.service';

@Module({
  controllers: [ViewsController],
  providers: [ViewsService, DatabaseService],
  exports: [ViewsService],
})
export class ViewsModule {}
