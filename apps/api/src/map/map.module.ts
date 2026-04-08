import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { WizardModule } from '../wizard/wizard.module';
import { MapController } from './map.controller';
import { MapService } from './map.service';

@Module({
  imports: [WizardModule],
  controllers: [MapController],
  providers: [MapService, DatabaseService],
  exports: [MapService],
})
export class MapModule {}
