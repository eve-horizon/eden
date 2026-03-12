import { Module } from '@nestjs/common';
import { ActivitiesModule } from './activities/activities.module';
import { HealthModule } from './health/health.module';
import { MapModule } from './map/map.module';
import { PersonasModule } from './personas/personas.module';
import { ProjectsModule } from './projects/projects.module';
import { QuestionsModule } from './questions/questions.module';
import { ReleasesModule } from './releases/releases.module';
import { StepsModule } from './steps/steps.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    HealthModule,
    ProjectsModule,
    PersonasModule,
    ActivitiesModule,
    StepsModule,
    QuestionsModule,
    ReleasesModule,
    TasksModule,
    MapModule,
  ],
})
export class AppModule {}
