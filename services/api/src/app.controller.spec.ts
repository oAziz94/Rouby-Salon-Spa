import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('smoke', () => {
    it('should return sprint 0 payload', () => {
      expect(appController.getSmoke()).toEqual({
        ok: true,
        service: 'api',
        version: '1',
      });
    });
  });
});
