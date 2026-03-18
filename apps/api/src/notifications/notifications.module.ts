import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, DatabaseService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
