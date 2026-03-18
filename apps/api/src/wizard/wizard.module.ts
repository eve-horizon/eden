import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { WizardController } from './wizard.controller';
import { WizardService } from './wizard.service';

@Module({
  controllers: [WizardController],
  providers: [WizardService, DatabaseService],
})
export class WizardModule {}
