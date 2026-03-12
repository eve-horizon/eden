import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';

@Module({
  controllers: [PersonasController],
  providers: [PersonasService, DatabaseService],
  exports: [PersonasService],
})
export class PersonasModule {}
