import { Module } from '@nestjs/common';
import { ChangesetsModule } from '../changesets/changesets.module';
import { DatabaseService } from '../common/database.service';
import { SourcesModule } from '../sources/sources.module';
import { WizardController } from './wizard.controller';
import { WizardService } from './wizard.service';

@Module({
  imports: [ChangesetsModule, SourcesModule],
  controllers: [WizardController],
  providers: [WizardService, DatabaseService],
})
export class WizardModule {}
