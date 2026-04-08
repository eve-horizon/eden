import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { DocumentExtractorService } from './document-extractor.service';
import { EveIngestService } from './eve-ingest.service';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';

@Module({
  controllers: [SourcesController],
  providers: [
    DatabaseService,
    EveIngestService,
    SourcesService,
    DocumentExtractorService,
  ],
  exports: [SourcesService, DocumentExtractorService],
})
export class SourcesModule {}
