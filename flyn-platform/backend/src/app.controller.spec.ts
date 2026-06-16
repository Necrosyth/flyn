import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FirebaseService } from './firebase/firebase.service';
import { WebsiteBuilderService } from './website-builder/website-builder.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: FirebaseService, useValue: {} },
        { provide: WebsiteBuilderService, useValue: {} },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  describe('root', () => {
    it('should have dependencies injected', () => {
      expect(appController).toBeDefined();
      expect(appService).toBeDefined();
    });
  });
});
