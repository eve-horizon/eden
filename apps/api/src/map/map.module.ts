import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { MapController } from './map.controller';
import { MapService } from './map.service';

@Module({
  controllers: [MapController],
  providers: [MapService, DatabaseService],
  exports: [MapService],
})
export class MapModule {}
