import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ActivitiesModule } from './activities/activities.module';
import { AuditModule } from './audit/audit.module';
import { ChangesetsModule } from './changesets/changesets.module';
import { ChatModule } from './chat/chat.module';
import { DatabaseService } from './common/database.service';
import { ProjectRoleMiddleware } from './common/project-role.middleware';
import { ExportModule } from './export/export.module';
import { HealthModule } from './health/health.module';
import { MapModule } from './map/map.module';
import { MembersModule } from './members/members.module';
import { PersonasModule } from './personas/personas.module';
import { ProjectsModule } from './projects/projects.module';
import { QuestionsModule } from './questions/questions.module';
import { ReleasesModule } from './releases/releases.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SearchModule } from './search/search.module';
import { SourcesModule } from './sources/sources.module';
import { StepsModule } from './steps/steps.module';
import { TasksModule } from './tasks/tasks.module';
import { WizardModule } from './wizard/wizard.module';

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
    SourcesModule,
    ReviewsModule,
    ChangesetsModule,
    ChatModule,
    SearchModule,
    ExportModule,
    AuditModule,
    MembersModule,
    WizardModule,
  ],
  providers: [DatabaseService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Resolve project role on all project-scoped routes
    consumer
      .apply(ProjectRoleMiddleware)
      .forRoutes('projects/:projectId');
  }
}
